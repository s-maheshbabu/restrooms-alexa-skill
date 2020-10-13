const unitUnderTest = require("../../src/gateway/RefugeeRestrooms");

const expect = require("chai").expect;
const nock = require('nock')

const cloneDeep = require("lodash.clonedeep");

const DUMMY_LATITUDE = 47.62078857421875;
const DUMMY_LONGITUDE = -122.30061853955556;

const dummyRestRooms = require("../../test-data/sample-RR-response.json");

describe("Input validation", function () {
    before(async () => {
        configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, undefined, undefined, dummyRestRooms);
    });

    it("should call Refugee Restrooms even when no search filters are provided.", async () => {
        const actualRestrooms = await unitUnderTest.searchRestroomsByLatLon(DUMMY_LATITUDE, DUMMY_LONGITUDE, undefined, undefined, undefined);
        expect(actualRestrooms.length).is.equal(dummyRestRooms.length);
    });

    it("should throw an error if latitude is invalid.", async () => {
        const invalidLatitudes = [undefined, null, ``];

        for (const invalidLatitude of invalidLatitudes) {
            await expect(unitUnderTest.searchRestroomsByLatLon(invalidLatitude, DUMMY_LONGITUDE, false, false, dummyRestRooms)).to.be.rejectedWith(TypeError);
        }
    });

    it("should throw an error if longitude is invalid.", async () => {
        const invalidLongitudes = [undefined, null, ``];

        for (const invalidLongitude of invalidLongitudes) {
            await expect(unitUnderTest.searchRestroomsByLatLon(DUMMY_LATITUDE, invalidLongitude, false, false, dummyRestRooms)).to.be.rejectedWith(TypeError);
        }
    });
});

describe("Calculate ratings", function () {
    const clonedRestRoom = cloneDeep(dummyRestRooms[0]);

    beforeEach(function () {
        nock.cleanAll();
    });

    it("should determine rating when there are no upvotes or downvotes on a restroom", async () => {
        clonedRestRoom.upvote = 0;
        clonedRestRoom.downvote = 0;
        configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, undefined, undefined, [clonedRestRoom]);

        const actualRestrooms = await unitUnderTest.searchRestroomsByLatLon(DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false);
        const actualRestroom = actualRestrooms[0];

        expect(actualRestroom.positive_rating).to.be.null;
    });

    it("should determine rating when upvotes information is missing", async () => {
        clonedRestRoom.upvote = undefined;
        clonedRestRoom.downvote = 0;
        configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, undefined, undefined, [clonedRestRoom]);

        const actualRestrooms = await unitUnderTest.searchRestroomsByLatLon(DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false);
        const actualRestroom = actualRestrooms[0];

        expect(actualRestroom.positive_rating).to.be.null;
    });

    it("should determine rating when downvotes information is missing", async () => {
        clonedRestRoom.upvote = 0;
        clonedRestRoom.downvote = undefined;
        configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, undefined, undefined, [clonedRestRoom]);

        const actualRestrooms = await unitUnderTest.searchRestroomsByLatLon(DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false);
        const actualRestroom = actualRestrooms[0];

        expect(actualRestroom.positive_rating).to.be.null;
    });

    it("should determine rating accurately when there are valid downvotes and upvotes.", async () => {
        // [upvotes, downvotes, expected positive_rating]
        const testDataSet = [[10, 0, 100], [13, 6, 68], [23, 23, 50], [0, 10, 0], [1, 999, 0],];

        for (const testdata of testDataSet) {
            clonedRestRoom.upvote = testdata[0];
            clonedRestRoom.downvote = testdata[1];
            configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, undefined, undefined, [clonedRestRoom]);

            const actualRestrooms = await unitUnderTest.searchRestroomsByLatLon(DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false);
            const actualRestroom = actualRestrooms[0];

            expect(actualRestroom.positive_rating).to.be.equal(testdata[2]);
        }
    });
});

function configureRRService(responseCode, latitude, longitude, isFilterByADA, isFilterByUnisex, payload) {
    if (!nock.isActive()) {
        nock.activate();
    }

    nock(unitUnderTest.BASE_URL)
        .get(`/api/v1/restrooms/by_location?page=1&per_page=10&offset=0&ada=${isFilterByADA ? `${isFilterByADA}` : `false`}&unisex=${isFilterByUnisex ? `${isFilterByUnisex}` : `false`}&lat=${latitude}&lng=${longitude}`)
        .reply(responseCode, JSON.stringify(payload, null, 2));
}
