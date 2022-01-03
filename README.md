# Norwegian Utility Bill

The 'Norwegian Utility Bill' is a device to calculate utility and grid prices for Norway.

## Install

To install the device:

1. Add the 'Norwegian Utility Bill' device.
2. Go to 'Advanced settings'.  If you have a spot plan or fixed price plan, edit the price formula.
3. Adjust the settings for grid capacity and grid energy for your grid provider.
4. Add a flow to update consumption from a pulse device, eg. Tibber Pulse.  WHEN: Power changed, THEN: Update consumption with <POWER>.
5. If the price comes from a price source, eg. Tibber, select 'From flow', and create the flow: WHEN: Price changed, THEN: Update price with <PRICE>.


### Release Notes:

#### 1.1.0

- Added support for slave devices
- Added action cards to update settings

#### 1.0.8

- Grid capacity cost is added as max. hourly consumption increases

#### 1.0.7

- Costs will be updated regularly even if consumption is not updated regularly

#### 1.0.6

- Fixed typo

#### 1.0.5

- Added trigger for 'Sum utility and grid price changed'
- Added options for number of decimals for prices

#### 1.0.4

- Can add more than one 'Norwegian Utility Bill' device
- Added 'Sum daily cost' and 'Sum yearly cost' capabilities
- Fixed calculation of grid yearly fixed amount

#### 1.0.3

- Fixed calculation of grid yearly fixed amount

#### 1.0.2

- Can now see the grid price
- Added trigger for 'New level for grid capacity'
- Added condition to check if current cost is below / above a specific value

#### 1.0.1

- Support existing grid costs regime
- Validation for the spot & fixed price cost formula
- Separate grid energy prices for winter and summer 
- Option for low price for weekends

#### 1.0.0

- Initial release
