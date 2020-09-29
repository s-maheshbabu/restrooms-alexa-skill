const nodemailer = require("nodemailer");
const EmailValidator = require("email-validator");

let AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });

const FROM_ADDRESS = "Refugee Restrooms <refugee.restrooms@gmail.com>";
const SUBJECT_LINE = "Refugee Restrooms - Alexa Skill";

const MAXIMUM_RESULTS = 10;

let transporter;

/**
 * Composes an email with the given restrooms and sends it to the user.
 * 
 * @param {*} toAddress The address to send the email to. This has to be a valid email
 * address. Will throw otherwise.
 * @param {*} zipcode The zipcode the user searched in.
 * @param {*} restrooms The restrooms whose details needs to be composed into an email.
 */
async function sendEmail(toAddress, zipcode, restrooms) {
    if (!EmailValidator.validate(toAddress)) throw new Error(`Invalid email address provided: ${toAddress}`);
    if (!Array.isArray(restrooms) || restrooms.length == 0) throw new Error(`At least one restroom should be provided as an array: ${restrooms}`);

    let info = await transporter.sendMail({
        from: FROM_ADDRESS,
        to: toAddress,
        subject: SUBJECT_LINE,
        html: buildBody(zipcode, restrooms.slice(0, MAXIMUM_RESULTS)),
    });
    console.log(`Email successfully sent. Email Id: ${info.messageId}.`);

    // What happens if sending email fails?
}

// TODO: This still needs to be tested.
function buildBody(zipcode, restrooms) {
    let body = `<b>Hello,<br/>
Here are some restrooms ${zipcode ? `at ${zipcode}` : `near you`}.</b><br/>`

    restrooms.forEach(restroom => {
        body += `<hr />
    <b>${restroom.name}</b><br/>
    Address: ${restroom.street}, ${restroom.city}, ${restroom.state} (<a href="https://www.google.com/maps/dir/?api=1&destination=${restroom.latitude},${restroom.longitude}">directions</a>)<br/>
    ${restroom.directions ? `Notes: ${restroom.directions}<br/>` : ``}
    &#10084; ${Number.isInteger(restroom.positive_rating) ? `${restroom.positive_rating}% positive` : `Not Rated`} | &#128663; ${restroom.distance} miles<br/>
    ${restroom.unisex ? '&\#9989;' : '&\#10060;'} Gender Neutral | ${restroom.accessible ? '&\#9989;' : '&\#10060;'} Accessible | ${restroom.changing_table ? '&\#9989;' : '&\#10060;'} Changing Table<br/>
    `
    });

    body += `The Google Maps links above are based on latitude/longitude of the restroom. It should take you very close to the destination but you might then want to use the restroom name and address to actually locate it.`;
    return body;
}

/**
 * Initializes the email transporter.
 * 
 * @param {*} transporterForTesting A mock transporter to be injected for testing.
 * In production paths, transporter need not be provided.
 */
const init = (transporterForTesting) => {
    return new Promise((resolve, reject) => {
        if (transporterForTesting) {
            transporter = transporterForTesting;
            resolve();
        }
        else if (!transporter) {
            console.log("Creating NodeMailer SES transporter.");
            transporter = nodemailer.createTransport({
                SES: new AWS.SES({
                    apiVersion: '2010-12-01'
                })
            });
            resolve();
        } else {
            resolve();
        }
    });
};

module.exports = {
    init: init,
    sendEmail: sendEmail,
};