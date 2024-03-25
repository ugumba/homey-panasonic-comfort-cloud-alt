import Homey from 'homey';
import { ComfortCloudClient, TokenExpiredError } from 'panasonic-comfort-cloud-client';
import { MyDevice } from './device';

export class MyDriver extends Homey.Driver {

  client: ComfortCloudClient | null | undefined = undefined;
  ignoreSettings:boolean=false;

  async getClient() : Promise<ComfortCloudClient> {
    if (this.client === undefined)
    {
      let appVersion = "1.20.1";
      this.log('initializing client ('+appVersion+')');
      this.client = new ComfortCloudClient(appVersion);
      let token:string = this.homey.settings.get("token");
      if (!token || token.length == 0)
      {
        this.log('missing token');
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
          token = await this.client.login(username, password);
          this.saveToken(token);
          this.log('saved token');
        }
        catch (e) {
          this.error('login failed:', e);
          this.client = null; 
        }
      }
      else {
        this.client.token = token;
        this.log('loaded token');
      }
    }
    if (this.client === null)
    {
      this.error('bad credentials');
      throw new Error('Authentication failed, edit credentials in app settings.');
    }

    return this.client;
  }

  async invokeClient<T>(request: (client: ComfortCloudClient) => Promise<T>) : Promise<T> {
    while (true)
    {
      let client = await this.getClient();
      try {
        return await request(client);
      }
      catch (e) {
        if (e instanceof TokenExpiredError)
        {
          this.log('invokeClient TokenExpiredError');
          this.resetClient();
        }
        else
        {
          throw e;
        }
      }
    }
  }

  resetClient() {
    this.log('resetClient');
    this.client = undefined;
    this.saveToken(null);

    this.getDevices()
      .forEach(device => (device as MyDevice).fetchAndRestartTimer());
  }

  saveToken(token:string|null) {
    this.ignoreSettings=true;
    this.homey.settings.set("token", token);
    this.ignoreSettings=false;
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
