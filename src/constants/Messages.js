const messages = Object.freeze({
    NOTIFY_MISSING_EMAIL_PERMISSIONS: 'By the way, I can email you the restrooms with additional information like Google Maps™ navigation links, but need permission to email you. I put a card in your Amazon Alexa app in case you plan to grant the permission.',
    NOTIFY_MISSING_GEO_LOCATION_PERMISSIONS: 'I need permissions to access your device address to search for restrooms near by. I put a card in the Amazon Alexa app to make it easy for you. Please open the Alexa app and enable device address permissions.',
    NOTIFY_MISSING_DEVICE_ADDRESS_PERMISSIONS: 'I need permissions to access your device address to search for restrooms near by. I put a card in the Amazon Alexa app to make it easy for you. Please open the Alexa app and enable device address permissions.',
});

module.exports = {
    messages: messages
};
