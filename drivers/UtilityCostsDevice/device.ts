'use strict';

import {BaseDevice} from '../../lib/BaseDevice';

const moment = require('../../lib/moment-timezone-with-data');

module.exports = class UtilityCostsDevice extends BaseDevice {

    async onInit(): Promise<void> {
        super.onInit();
        this._dh.setOptions({
            addFixedUtilityCosts: false,
            addCapabilityCosts: false
        });
        await this.migrate();
        this.scheduleCheckTime(5);
        this.logger.verbose(this.getName() + ' -> device initialized');
    }

    async migrate() {
        try {
            if (!this.hasCapability('meter_power.acc')) {
                await this.addCapability('meter_power.acc');
            }
            if (!this.hasCapability('meter_power.year')) {
                await this.addCapability('meter_power.year');
            }
            if (!this.hasCapability('meter_energy')) {
                await this.addCapability('meter_energy');
            }
            const migVersion = this.getStoreValue('version');
            if (!migVersion || migVersion < 2) {
                const consumptionMinute = this.getStoreValue('consumptionMinute');
                if (consumptionMinute !== undefined && consumptionMinute !== null) {
                    this._dh.getStoreValues().consumptionMinute = consumptionMinute;
                    this.unsetStoreValue('consumptionMinute').catch((err: any) => this.logger.error(err));
                }
                const lastConsumptionUpdate = this.getStoreValue('lastConsumptionUpdate');
                if (lastConsumptionUpdate !== undefined && lastConsumptionUpdate !== null) {
                    this._dh.getStoreValues().lastConsumptionUpdate = lastConsumptionUpdate;
                    this.unsetStoreValue('lastConsumptionUpdate').catch((err: any) => this.logger.error(err));
                }
                this._dh.getStoreValues().highest_10_hours = [];
                await this._dh.storeStoreValues();
            }
            await this.setStoreValue('version', 3);
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
        if (changedKeys.includes('priceDecimals')) {
            await this.updatePriceDecimals(newSettings.priceDecimals);
        }
    }

    async checkTime() {
        if (this._deleted) {
            return;
        }
        try {
            this.clearCheckTime();

            // @ts-ignore
            const globalDeviceHandler = this.homey.app.getDeviceHandler();

            if (globalDeviceHandler) {
                this.updateSettings();

                // Copy prices
                await this.setCapabilityValue('meter_price_excl', globalDeviceHandler.device.getCapabilityValue('meter_price_excl'));
                await this.setCapabilityValue('meter_price_incl', globalDeviceHandler.device.getCapabilityValue('meter_price_incl'));

                const localTime = moment();
                await this._dh.gridPriceCalculation(localTime);
                if (this._dh.getStoreValues().consumptionMinute) {
                    this.commandQueue.add(async () => {
                        await this._dh.updateConsumption(undefined, localTime);
                    });
                }
            } else {
                this.logger.warn(`Unable to calculate: no master device`);
            }
        } catch (err) {
            this.logger.error(err);
        } finally {
            await this._dh.storeStoreValues();
            this.scheduleCheckTime();
        }
    }

    async onUpdateConsumption(consumption: number) {
        this.logger.debug(`New consumption: ${consumption}`);
        this.commandQueue.add(async () => {
            this.updateSettings();
            this._dh.getStoreValues().consumptionMinute = true;
            await this._dh.updateConsumption(consumption, moment());
        });
    }

    async onUpdateEnergy(energy: number) {
        this.logger.debug(`New energy: ${energy}`);
        this.commandQueue.add(async () => {
            this.updateSettings();
            this._dh.getStoreValues().consumptionMinute = false;
            await this._dh.updateEnergy(energy, moment());
        });
    }

    updateSettings(): void {
        // @ts-ignore
        const globalDeviceHandler = this.homey.app.getDeviceHandler();
        if (globalDeviceHandler) {
            this._dh.setSettings({
                ...globalDeviceHandler.getSettings(),
                priceDecimals: this.getSetting('priceDecimals'),
                resetEnergyDaily: this.getSetting('resetEnergyDaily')
            });
        }
    }

};
