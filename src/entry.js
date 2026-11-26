import { installDebugBridge } from './debug-bridge.js';
import { getAppBridge, run } from './ui/app.js';

installDebugBridge(getAppBridge());
run();
