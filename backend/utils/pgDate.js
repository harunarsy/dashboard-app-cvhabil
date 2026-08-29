const { types } = require('pg');

// PostgreSQL DATE (OID 1082) has no timezone. Keep it as the database's
// literal YYYY-MM-DD instead of letting pg turn it into a UTC-sensitive Date.
const PG_DATE_OID = 1082;
const parsePgDate = (value) => value;

const installPgDateParser = () => {
  types.setTypeParser(PG_DATE_OID, parsePgDate);
};

module.exports = {
  PG_DATE_OID,
  parsePgDate,
  installPgDateParser,
};
