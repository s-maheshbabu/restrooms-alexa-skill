const unitUnderTest = require("../../src/index");

const expect = require("chai").expect;
const importFresh = require('import-fresh');

const context = {};

describe("Invalid cases for 'YesIntentHandler'", function () {
    it("should render an error message if state is missing or invalid in the session attributes.", async () => {
        const event = importFresh("../../test-data/intenthandlers/yes_android");
        invalidStates = [null, undefined, 'any-state-that-not-offering-directions'];

        for (var i = 0; i < invalidStates.length; i++) {
            const state = invalidStates[i];
            event.session.attributes.state = state;

            const responseContainer = await unitUnderTest.handler(event, context);
            const response = responseContainer.response;

            expect(response.shouldEndSession).to.be.true;
            const outputSpeech = response.outputSpeech;
            expect(outputSpeech.ssml).to.equal(
                `<speak>I'm Sorry, I'm having trouble helping you. Please try again later.</speak>`
            );
            expect(outputSpeech.type).to.equal("SSML");
        }
    });

    it("should render an error message if latitude is not available in the session attributes", async () => {
        const event = importFresh("../../test-data/intenthandlers/yes_android");
        invalidLatitudes = [null, undefined, 'a string'];

        for (var i = 0; i < invalidLatitudes.length; i++) {
            const latitude = invalidLatitudes[i];
            event.session.attributes.latitude = latitude;

            const responseContainer = await unitUnderTest.handler(event, context);
            const response = responseContainer.response;

            expect(response.shouldEndSession).to.be.true;
            const outputSpeech = response.outputSpeech;
            expect(outputSpeech.ssml).to.equal(
                `<speak>I'm Sorry, I'm having trouble helping you. Please try again later.</speak>`
            );
            expect(outputSpeech.type).to.equal("SSML");
        }
    });

    it("should render an error message if longitude is not available in the session attributes", async () => {
        const event = importFresh("../../test-data/intenthandlers/yes_android");
        invalidLongitudes = [null, undefined, 'a string'];

        for (var i = 0; i < invalidLongitudes.length; i++) {
            const longitude = invalidLongitudes[i];
            event.session.attributes.latitude = longitude;

            const responseContainer = await unitUnderTest.handler(event, context);
            const response = responseContainer.response;

            expect(response.shouldEndSession).to.be.true;
            const outputSpeech = response.outputSpeech;
            expect(outputSpeech.ssml).to.equal(
                `<speak>I'm Sorry, I'm having trouble helping you. Please try again later.</speak>`
            );
            expect(outputSpeech.type).to.equal("SSML");
        }
    });

    it("should render an error message if AppLink interface is not supported. We shouldn't be offering directions on devices that don't support AppLinks.", async () => {
        const event = importFresh("../../test-data/intenthandlers/yes_android");
        delete event.context.System.device.supportedInterfaces.AppLink;

        const responseContainer = await unitUnderTest.handler(event, context);
        const response = responseContainer.response;

        expect(response.shouldEndSession).to.be.true;
        const outputSpeech = response.outputSpeech;
        expect(outputSpeech.ssml).to.equal(
            `<speak>I'm Sorry, I'm having trouble helping you. Please try again later.</speak>`
        );
        expect(outputSpeech.type).to.equal("SSML");
    });

    it("should render an error message if supported catalog types is missing. We cannot determine which Maps application to punch out to without this information.", async () => {
        const event = importFresh("../../test-data/intenthandlers/yes_android");
        delete event.context.AppLink.supportedCatalogTypes;

        const responseContainer = await unitUnderTest.handler(event, context);
        const response = responseContainer.response;

        expect(response.shouldEndSession).to.be.true;
        const outputSpeech = response.outputSpeech;
        expect(outputSpeech.ssml).to.equal(
            `<speak>I'm Sorry, I'm having trouble helping you. Please try again later.</speak>`
        );
        expect(outputSpeech.type).to.equal("SSML");
    });

    it("should render an error message if supported catalog types is invalid. It has to be either an Android or an iOS store.", async () => {
        const event = importFresh("../../test-data/intenthandlers/yes_android");
        invalidCatalogTypes = [[], ['NOT_IOS_APP_STORE'], ['NOT_GOOGLE_PLAY_STORE']];

        for (var i = 0; i < invalidCatalogTypes.length; i++) {
            const invalidCatalogType = invalidCatalogTypes[i];
            event.context.AppLink.supportedCatalogTypes = invalidCatalogType;

            const responseContainer = await unitUnderTest.handler(event, context);
            const response = responseContainer.response;

            expect(response.shouldEndSession).to.be.true;
            const outputSpeech = response.outputSpeech;
            expect(outputSpeech.ssml).to.equal(
                `<speak>I'm Sorry, I'm having trouble helping you. Please try again later.</speak>`
            );
            expect(outputSpeech.type).to.equal("SSML");
        }
    });
});