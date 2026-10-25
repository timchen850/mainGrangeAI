const { contextBridge } = require('electron')

// Lets the React code know it is running inside the desktop app
contextBridge.exposeInMainWorld('isDesktopApp', true)
