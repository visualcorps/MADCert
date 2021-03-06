const _ = require('lodash');
const forge = require('node-forge');
const fs = require('fs');
const moment = require('moment');

forge.options.usePureJavaScript = true;

const pki = forge.pki;

function getSubject(cert) {
    const parts = cert.subject.attributes.map(function(attr) {
        return `${attr.shortName}=${attr.value}`;
    });

    return `/${parts.reverse().join('/')}`;
}

function expired(cert) {
    return moment(cert.validity.notAfter).isBefore(moment());
}

function getExpires(cert) {
    return moment(cert.validity.notAfter).format('YYMMDDHHmmss[Z]');
}

function createDatabaseEntries(pemCerts, revokedCNs = []) {
    return pemCerts.map(pemCert => {
        const pem = fs.readFileSync(pemCert, 'utf8');
        const cert = pki.certificateFromPem(pem);
        const subject = getSubject(cert);

        // Determine if the list of revoked CNs contains this cert so we can mark it revoked in the database.
        const revokedCn = _.find(revokedCNs, cn => {
            return subject.toUpperCase().indexOf(cn.toUpperCase()) > -1;
        });

        if (revokedCn) {
            return `R\t${getExpires(cert)}\t${moment().format('YYMMDDHHmmss[Z]')}\t${cert.serialNumber}\tunknown\t${subject}`;
        } else {
            return `${expired(cert) ? 'E' : 'V'}\t${getExpires(cert)}\t\t${cert.serialNumber}\tunknown\t${subject}`;
        }
    });
}

function writeDatabaseFile(entries, dbFile) {
    fs.writeFileSync(dbFile, entries.join('\n'));
    fs.writeFileSync(`${dbFile}.attr`, 'unique_subject = no'); // Seems to be required by openssl to generate a CRL.
}

function createDatabase(pemCerts, dbFile = 'index.txt', revokedCNs = []) {
    writeDatabaseFile(createDatabaseEntries(pemCerts, revokedCNs), dbFile);
}

module.exports = {
    create: createDatabase
};
