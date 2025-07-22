import Homey from 'homey';
import { ComfortCloudClient, TokenExpiredError } from 'panasonic-comfort-cloud-client';
import { MyDevice } from './device';
import { Mutex } from 'async-mutex';

// From https://github.com/Magnusri/homey-panasonic-comfort-cloud-alt/blob/master/drivers/aircon/driver.ts
// This is a workaround for using node-fetch in Homey apps
// Ignore ts errors for this line
// @ts-ignore
const fetch = (...args: any) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export class MyDriver extends Homey.Driver {

  client: ComfortCloudClient | null | undefined = undefined;
  ignoreSettings:boolean=false;
  clientMutex:Mutex = new Mutex();

  // From https://github.com/Magnusri/homey-panasonic-comfort-cloud-alt/blob/master/drivers/aircon/driver.ts
  async getLatestAppVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      let appleAppId = "1348640525"; // ID of the Panasonic Comfort Cloud app on the Apple App Store
      let url = "https://itunes.apple.com/lookup?id=" + appleAppId;
      // Fetch the app details from the Apple App Store using node-fetch
      fetch(url)
        .then(response => response.json())
        .then((data: any) => {
          if (data.resultCount == 0) {
            reject("No app found with ID " + appleAppId);
          } else {
            resolve(data.results[0].version);
          }
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  async getClient() : Promise<ComfortCloudClient> {
    if (this.client === undefined)
    {
      await this.clientMutex.runExclusive(async () => {
        if (this.client === undefined)
        {
          let appVersion = "1.21.0";
          try {
            appVersion = await this.getLatestAppVersion();
          }
          catch (e) {
            this.error('pcc app version query to itunes failed', e);
          }
          this.log('initializing client ('+appVersion+')');
          this.client = new ComfortCloudClient(appVersion);
          const username:string = this.homey.settings.get("username");
          const password:string = this.homey.settings.get("password");
          if (!username || !password)
          {
            this.error('missing crdentials');
            this.client = null;
            throw new Error('Provide credentials in app settings.');
          }
          this.log('authenticating '+username.replace("@","[at]").replace(".","[dot]"));
          try {
            await this.client.login(username, password);
            this.log('authenticated');
          }
          catch (e) {
            this.error('login failed:', e);
            this.client = null; 
          }
        }
      });
    };
    if (this.client === null || this.client === undefined /*this shouldn't happen*/)
    {
      this.error('bad credentials');
      throw new Error('Authentication failed, edit credentials in app settings.');
    }

    return this.client;
  }

  async invokeClient<T>(request: (client: ComfortCloudClient) => Promise<T>) : Promise<T> {
    let retries = 0;
    const maxRetries = 2;
    
    while (retries <= maxRetries)
    {
      let client = await this.getClient();
      try {
        return await request(client);
      }
      catch (e) {
        if (e instanceof TokenExpiredError && retries < maxRetries)
        {
          this.log('invokeClient TokenExpiredError (retry ' + (retries + 1) + ')');
          this.resetClientOnly(); // Don't restart device timers, they'll retry naturally
          retries++;
        }
        else
        {
          throw e;
        }
      }
    }
    throw new Error('Max retries exceeded for authentication');
  }

  resetClientOnly() {
    this.log('resetClientOnly');
    this.client = undefined;
  }

  resetClient() {
    this.log('resetClient');
    this.resetClientOnly();

    this.getDevices()
      .forEach(device => (device as MyDevice).fetchAndRestartTimer());
  }

  /**
   * Method to register all device specific action flow cards
   */
    async initActionCards() {
      const changeAirSwingLR = this.homey.flow.getActionCard('device-change-air-swing-leftright');
      changeAirSwingLR.registerRunListener(async (args) => {
        await args.device.postToService({ air_swing_lr: args.direction });
      });

      const changeAirSwingUD = this.homey.flow.getActionCard('device-change-air-swing-updown');
      changeAirSwingUD.registerRunListener(async (args) => {
        await args.device.postToService({ air_swing_ud: args.direction });
      });

      const changeEcoMode = this.homey.flow.getActionCard('device-change-eco-mode');
      changeEcoMode.registerRunListener(async (args) => {
        await args.device.postToService({ eco_mode: args.mode });
      });

      const changeFanSpeed = this.homey.flow.getActionCard('device-change-fan-speed');
      changeFanSpeed.registerRunListener(async (args) => {
        await args.device.postToService({ fan_speed: args.speed });
      });

      const changeOperationMode = this.homey.flow.getActionCard('device-change-operation-mode');
      changeOperationMode.registerRunListener(async (args) => {
        await args.device.postToService({ operation_mode: args.mode });
      });
    }

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {

    this.homey.settings.on('set', (key:string) => {
      if (this.ignoreSettings || key == "log")
        return;
      this.log('settings.set');
      this.resetClient();
    });
    this.homey.settings.on('unset', (key:string) => {
      if (this.ignoreSettings || key == "log")
        return;
      this.log('settings.unset');
      this.resetClient();
    });

    // Register all device specific action flow cards
    await this.initActionCards();

    this.log('Driver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    this.log('onPairListDevices');

    let devices = (await this.invokeClient(c => c.getGroups()))
      .flatMap(group => group.devices.map(device => ({
        name: group.name + ": " + device.name,
        data: {
          id: device.guid
        }
      })));

    // if (process.env.DEBUG === "1")
    //   devices = devices
    //     .concat([
    //       {
    //         name: "Mock group: Mock device",
    //         data: {
    //           id: "deadbeef"
    //         }
    //       }
    //     ]);

    this.log(devices);

    return devices;
  }

}

module.exports = MyDriver;
