import {AppRegistry, LogBox} from 'react-native';
import { name as appName } from './app.json';

// Vega debug builds render warnings as a full-width TV overlay. Device logs remain
// available through loggingctl without obscuring remote-control testing.
LogBox.ignoreAllLogs(true);

const {App} = require('./src/App');

AppRegistry.registerComponent(appName, () => App);
