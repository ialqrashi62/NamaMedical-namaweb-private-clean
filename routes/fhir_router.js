'use strict';
// routes/fhir_router.js
// Mounts the FHIR R4 Public Surface at /fhir/*.
// Pure JS, no npm install. No new middleware order is added at the app level
// (this module just exports a wired-up Express router that server.js mounts
// with `app.use('/fhir', fhirRouter)`).

const { router: fhirRouter } = require('../lib/fhir/router');

// Optional: also re-export the CapabilityStatement builder for use by docs
// and the OpenAPI generator.
const { capability } = require('../lib/fhir/router');

module.exports = fhirRouter;
module.exports.fhirRouter = fhirRouter;
module.exports.capability = capability;
