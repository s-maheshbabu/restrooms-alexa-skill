const { Client } = require("@googlemaps/google-maps-services-js");
const InvalidAddressError = require("../errors/InvalidAddressError");

const client = new Client({});
let API_KEY;

/**
 * Loads the Google Maps api key from environment.
 */
const init = async () => {
    API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!API_KEY) {
        throw new Error(`Failed to fetch Google Maps API Key. Check environment variables configuration.`);
    }
};

const BASE_URL = `https://maps.googleapis.com/maps`;
const ZERO_RESULTS_STATUS = `ZERO_RESULTS`;

/**
 * Returns latitude/longitude for the given address. If latitude and longitude are
 * given, the results are biased to be closer to those bounds.
 * 
 * @param {*} address The address to lookup geocodes for.
 * @param {*} latitude The latitude to be used to bound the results. Only valid if
 * longitude is also provided.
 * @param {*} longitude The longitude to be used to bound the results. Only valid if
 * latitude is also provided.
 */
const getCoordinates = async (address, latitude, longitude) => {
    console.log(`Fetching geocodes for ${address}. Bounds are Latitude: ${latitude}, Longitude: ${longitude}`);
    if (!API_KEY) await init();

    let bounds = undefined;
    if (latitude && longitude) bounds = `${latitude},${longitude}|${latitude},${longitude}`;
    const response = await client.geocode({
        params: {
            address: address,
            ...(bounds && { bounds: bounds }),
            components: 'country:US',
            key: API_KEY,
        },
        // TODO: Can this be tested?
        timeout: 1000, // milliseconds
    });

    if (response.data.status === ZERO_RESULTS_STATUS)
        throw new InvalidAddressError(`Unable to locate the address: ${address}. It is probably an invalid address.`);

    const result = response.data.results[0];
    const lat = result.geometry.location.lat;
    const lng = result.geometry.location.lng;

    // TODO: Leverage "partial_match" field and "formatted_address" fields to improve UX.
    return { latitude: lat, longitude: lng };
};

module.exports = {
    BASE_URL: BASE_URL,
    getCoordinates: getCoordinates,
    API_KEY: API_KEY,
};