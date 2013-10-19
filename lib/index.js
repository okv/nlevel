'use strict';

function Batch(db, prefix, options) {
	options = options || {};
	this.db = db;
	if (!db) throw new Error('`db` for batch is not set');
	if (!prefix) throw new Error('`prefix` for batch is not set');
	this.prefix = prefix;
	this.separator = options.separator || '~';
}

Batch.prototype.put = function(doc, callback) {
	this.db.put(this.prefix, doc, callback);
};

Batch.prototype.get = function(callback) {
	this.db.get(this.prefix, callback);
};

Batch.prototype.del = function(callback) {
	this.db.del(this.prefix, callback);
};

exports.Batch = Batch;
