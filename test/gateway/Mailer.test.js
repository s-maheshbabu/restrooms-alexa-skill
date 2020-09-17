const unitUnderTest = require("gateway/Mailer.js");

const chai = require('chai')
chai.use(require('chai-as-promised'))
const expect = require("chai").expect;
const mockery = require('mockery');

const nodemailerMock = require('nodemailer-mock');
const transporter = nodemailerMock.createTransport({
    host: '127.0.0.1',
    port: -100,
});

describe("Input validation while sending emails.", function () {
    const DUMMY_EMAIL_ADDRESS = "success@simulator.amazonses.com";
    const DUMMY_ZIP_CODE = "77840";

    const dummyRestRooms = require("../../test-data/sample-RR-response.json");

    before(async () => {
        mockery.enable({ warnOnUnregistered: false });
        mockery.registerMock('nodemailer', nodemailerMock);
        await unitUnderTest.init(transporter);
    });

    afterEach(function () {
        nodemailerMock.mock.reset();
    });

    after(async () => {
        mockery.deregisterAll();
        mockery.disable();
    });

    it("should throw an error if toAddress is not valid.", async () => {
        const invalid_email_addresses = ["invalid@email@address.com", null, undefined, "invalid@email", "invalidEmailAddress"];

        for (var index = 0; index < invalid_email_addresses.length; index++) {
            const invalid_email_address = invalid_email_addresses[index];

            await expect(unitUnderTest.sendEmail(invalid_email_address, DUMMY_ZIP_CODE, dummyRestRooms)).to.be.rejectedWith(Error);
        }
    });

    it("should throw an error if restrooms are missing.", async () => {
        const invalid_restrooms_inputs = [null, undefined, []];

        for (var index = 0; index < invalid_restrooms_inputs.length; index++) {
            const invalid_restrooms_input = invalid_restrooms_inputs[index];

            await expect(unitUnderTest.sendEmail(DUMMY_EMAIL_ADDRESS, DUMMY_ZIP_CODE, invalid_restrooms_input)).to.be.rejectedWith(Error);
        }
    });
});
