'use strict';

import {BaseDevice} from '../../lib/BaseDevice';

const moment = require('../../lib/moment-timezone-with-data');
const pricesLib = require('../../lib/prices');
const nordpool = require('../../lib/nordpool');
import {DeviceHandler} from '../../lib/DeviceHandler';

module.exports = class UtilityCostsDevice extends BaseDevice {

    _dh!: DeviceHandler;
    _lastFetchData: any;
    _lastPrice: any;
    _prices: any;
    _deleted?: boolean;
    curTimeout?: NodeJS.Timeout;

    async onInit(): Promise<void> {
        super.onInit();
        this._dh = new DeviceHandler(this);
        this._lastFetchData = undefined;
        this._lastPrice = undefined;
        this._prices = undefined;

        await this.migrate();
        this.scheduleCheckTime(5);
        this.logger.verbose(this.getName() + ' -> device initialized');
    }

    async migrate() {
        try {
            if (!this.hasCapability('meter_sum_current')) {
                await this.addCapability('meter_sum_current');
            }
            if (!this.hasCapability('meter_sum_month')) {
                await this.addCapability('meter_sum_month');
            }
            if (!this.hasCapability('meter_gridprice_incl')) {
                await this.addCapability('meter_gridprice_incl');
            }
            if (!this.hasCapability('meter_cost_year')) {
                await this.addCapability('meter_cost_year');
                await this.setCapabilityValue('meter_cost_year', this.getCapabilityValue('meter_cost_month') || 0);
            }
            if (!this.hasCapability('meter_grid_year')) {
                await this.addCapability('meter_grid_year');
                await this.setCapabilityValue('meter_grid_year', this.getCapabilityValue('meter_grid_month') || 0);
            }
            if (!this.hasCapability('meter_sum_day')) {
                await this.addCapability('meter_sum_day');
            }
            if (!this.hasCapability('meter_sum_year')) {
                await this.addCapability('meter_sum_year');
            }
            if (!this.hasCapability('meter_price_sum')) {
                await this.addCapability('meter_price_sum');
            }
            if (!this.hasCapability('meter_consumption')) {
                await this.addCapability('meter_consumption');
            }
            this.logger.info(this.getName() + ' -> migrated OK');
        } catch (err) {
            this.logger.error(err);
        }
    }

    async onSettings({oldSettings, newSettings, changedKeys}: {
        oldSettings: any;
        newSettings: any;
        changedKeys: string[];
    }): Promise<string | void> {
        if (changedKeys.includes('costFormula')) {
            this._dh.validateCostFormula(newSettings.costFormula);
        }
        if (changedKeys.includes('priceArea')) {
            this._lastFetchData = undefined;
        }
        if (changedKeys.includes('priceDecimals')) {
            await this.updatePriceDecimals(newSettings.priceDecimals);
        }
        this._lastPrice = undefined;
        this.scheduleCheckTime(2);
    }

    async updatePriceDecimals(priceDecimals: string) {
        try {
            const decimals = priceDecimals === 'DEC2' ? 2 : 5;

            const capOps1 = this.getCapabilityOptions('meter_price_incl');
            capOps1.decimals = decimals;
            await this.setCapabilityOptions('meter_price_incl', capOps1);

            const capOps2 = this.getCapabilityOptions('meter_gridprice_incl');
            capOps2.decimals = decimals;
            await this.setCapabilityOptions('meter_gridprice_incl', capOps2);

            const capOps3 = this.getCapabilityOptions('meter_price_excl');
            capOps3.decimals = decimals;
            await this.setCapabilityOptions('meter_price_excl', capOps3);

            const capOps4 = this.getCapabilityOptions('meter_price_sum');
            capOps4.decimals = decimals;
            await this.setCapabilityOptions('meter_price_sum', capOps4);
        } catch (err) {
            this.logger.error('Updating number of decimals failed: ', err);
        }
    }

    onDeleted() {
        this._deleted = true;
        this.clearCheckTime();
        this.logger.verbose(this.getName() + ' -> device deleted');
    }

    clearCheckTime() {
        if (this.curTimeout) {
            this.homey.clearTimeout(this.curTimeout);
            this.curTimeout = undefined;
        }
    }

    scheduleCheckTime(seconds = 60) {
        if (this._deleted) {
            return;
        }
        this.clearCheckTime();
        this.logger.verbose(`Checking time in ${seconds} seconds`);
        this.curTimeout = this.homey.setTimeout(this.checkTime.bind(this), seconds * 1000);
    }

    async checkTime() {
        if (this._deleted) {
            return;
        }
        try {
            this.clearCheckTime();
            const settings = this.getSettings();
            if (settings.priceCalcMethod === 'nordpool_spot') {
                if (this.shallFetchSpotPrices()) {
                    await this.fetchSpotPrices();
                }
                if (this._prices) {
                    await this.onSpotPrices();
                }
            } else if (settings.priceCalcMethod === 'fixed') {
                await this._dh.fixedPriceCalculation();
            }
            const localTime = moment();
            await this._dh.gridPriceCalculation(localTime);
            await this._dh.updateConsumption(undefined, localTime);
        } catch (err) {
            this.logger.error(err);
        } finally {
            this.scheduleCheckTime();
        }
    }

    shallFetchSpotPrices() {
        return !this._prices
            || !this._lastFetchData
            || pricesLib.toHour(this._lastFetchData) !== pricesLib.toHour(moment());
    }

    async fetchSpotPrices() {
        try {
            const settings = this.getSettings();
            const priceArea = settings.priceArea || 'Bergen';
            this.logger.verbose('Will fetch prices:', this.getData().id, priceArea);
            const localTime = moment().startOf('day');
            const prices = await nordpool.fetchPrices(localTime, {priceArea, currency: 'NOK'});
            if (prices) {
                this._lastFetchData = moment();
                this._prices = prices;
                this.logger.info('Got prices:', this.getData().id, prices.length);
            }
        } catch (err) {
            this.logger.error(err);
        }
    }

    async onSpotPrices() {
        try {
            const localTime = moment();

            const currentPrice = pricesLib.currentPrice(this._prices, localTime);
            const startAtHour = currentPrice ? pricesLib.toHour(currentPrice.startsAt) : undefined;
            if (currentPrice) {
                this.logger.info('Current price:', startAtHour, currentPrice.price);
                const priceChanged = !this._lastPrice || startAtHour !== pricesLib.toHour(this._lastPrice.startsAt);
                if (priceChanged) {
                    this._lastPrice = currentPrice;
                    await this._dh.spotPriceCalculation(currentPrice.price);
                }
            }
        } catch (err) {
            this.logger.error(err);
        }
    }

    async onUpdatePrice(price: number) {
        this.logger.debug(`New price: ${price}`);
        await this._dh.updatePrice(price);
    }

    async onUpdateConsumption(consumption: number) {
        this.logger.debug(`New consumption: ${consumption}`);
        await this._dh.updateConsumption(consumption, moment());
    }

};