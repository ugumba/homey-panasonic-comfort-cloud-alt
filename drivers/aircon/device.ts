import Homey from 'homey';
import { MyDriver } from './driver';
import { ComfortCloudClient, Power, Parameters } from 'panasonic-comfort-cloud-client';

function getParam(value:any, transform: (v:any) => any) : any
{
  if (value === undefined)
    return undefined;
  return transform(value);
}

class MyDevice extends Homey.Device {

  id: string = this.getData().id;
  client: ComfortCloudClient | null = null;
  timer: any = null; 

  async updateFromClient() {
    let device = await this.client?.getDevice(this.id);
    if (device)
    {
      this.log("updateFromClient:", device);
      await this.setCapabilityValue('onoff', device.operate == 1);
      await this.setCapabilityValue('measure_temperature', device.insideTemperature);
      await this.setCapabilityValue('target_temperature', device.temperatureSet);
      await this.setCapabilityValue('operation_mode', device.operationMode.toString());
      await this.setCapabilityValue('eco_mode', device.ecoMode.toString());
      await this.setCapabilityValue('air_swing_lr', device.airSwingLR.toString());
      await this.setCapabilityValue('air_swing_ud', device.airSwingUD.toString());
      await this.setCapabilityValue('fan_auto_mode', device.fanAutoMode.toString());
      await this.setCapabilityValue('fan_speed', device.fanSpeed.toString());
      await this.setCapabilityValue('nanoe_mode', device.nanoe.toString());
    }
    else
      this.log("getDevice() == null");
  }

  async updateAndRestartTimer()
  {
    if (this.timer)
      clearInterval(this.timer);
    await this.updateFromClient();
    this.timer = setInterval(() => this.updateFromClient(), 60000);
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    this.client = await (this.driver as MyDriver).getClient();

    await this.updateAndRestartTimer();

    this.registerMultipleCapabilityListener(
      [
        'onoff',
        'target_temperature',
        'operation_mode',
        'eco_mode',
        'air_swing_lr',
        'air_swing_ud',
        'fan_auto_mode',
        'fan_speed',
        'nanoe_mode'
      ],
      async (values) => {
        this.log('changing:', values);
        let params : Parameters = { 
          operate: getParam(values['onoff'], v => v ? Power.On : Power.Off), 
          temperatureSet: values['target_temperature'],
          operationMode: getParam(values['operation_mode'], v => parseInt(v)),
          ecoMode: getParam(values['eco_mode'], v => parseInt(v)),
          airSwingLR: getParam(values['air_swing_lr'], v => parseInt(v)),
          airSwingUD: getParam(values['air_swing_ud'], v => parseInt(v)),
          fanAutoMode: getParam(values['fan_auto_mode'], v => parseInt(v)),
          fanSpeed: getParam(values['fan_speed'], v => parseInt(v)),
          actualNanoe: getParam(values['nanoe_mode'], v => parseInt(v))
        };
        this.log('setParameters:', params);
        await this.client?.setParameters(this.id, params);
        await this.updateAndRestartTimer();
      },
      3000
    );

    this.log('MyDevice has been initialized');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('MyDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings: {}, newSettings: {}, changedKeys: [] }): Promise<string|void> {
    this.log('MyDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('MyDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('MyDevice has been deleted');
  }

}

module.exports = MyDevice;
