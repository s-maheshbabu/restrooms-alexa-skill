const ratings = Object.freeze({
    POSITIVE: 70,
    NEUTRAL: 50,
    NAGATIVE: 0,
});

const states = Object.freeze({
    OFFER_DIRECTIONS: "OFFER_DIRECTIONS",
});

const applinks = Object.freeze({
    APP_LINK_INTERFACE: "AppLink",
    SPEAK_PROMPT_BEHAVIOR: "SPEAK",
    UNIVERSAL_APP_LINK_TYPE: "UNIVERSAL_LINK",
});

const ios = Object.freeze({
    APPLE_MAPS_IDENTIFIER: "id915056765",
    STORE_TYPE: "IOS_APP_STORE",
});

const android = Object.freeze({
    GOOGLE_MAPS_IDENTIFIER: "com.google.android.apps.maps",
    STORE_TYPE: "GOOGLE_PLAY_STORE",
});

module.exports = {
    android: android,
    applinks: applinks,
    ios: ios,
    ratings: ratings,
    states: states,
};
