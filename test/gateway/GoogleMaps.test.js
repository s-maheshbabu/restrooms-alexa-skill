const chai = require('chai')
chai.use(require('chai-as-promised'))
const assert = require("chai").assert;
const importFresh = require('import-fresh');

describe("Google Geocoding gateway tests", function () {
    it("Fetching coordinates should throw an error if we are not able to load the api key from the environment.", async () => {
        delete process.env.GOOGLE_MAPS_API_KEY; // Make sure key doesn't exist.

        const unitUnderTest = importFresh("gateway/GoogleMaps");

        try {
            await unitUnderTest.getCoordinates('any address');
            assert.fail('Expected an error to be thrown');
        } catch (error) {
            assert.equal(error.message, `Failed to fetch Google Maps API Key. Check environment variables configuration.`);
        }
    });
});