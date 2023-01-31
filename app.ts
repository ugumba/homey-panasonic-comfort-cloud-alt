import Homey from 'homey';
import hook_stdout from './hook';

class MyApp extends Homey.App {

  logs:string[] = [];
  unhook: () => void = () => {};

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {

    this.unhook = hook_stdout((str:string) => {
      this.logs = this.logs.slice(-200).concat(str);
      this.homey.settings.set("log", this.logs.join(""));
    });

    this.log('MyApp has been initialized');
  }

  async onUninit(): Promise<void> {
    this.unhook();
  }

}

module.exports = MyApp;
