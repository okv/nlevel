'use strict';

var inherits = require('util').inherits;


function BaseBatch(db, prefix) {
	this.db = db;
	if (!db) throw new Error('`db` for batch is not set');
	if (!prefix) throw new Error('`prefix` for batch is not set');
	this.prefix = prefix;
}

BaseBatch.prototype.separator = '~';
BaseBatch.prototype.end = '\xff';


function ValBatch(db, prefix) {
	BaseBatch.call(this, db, prefix);
}

inherits(ValBatch, BaseBatch);

ValBatch.prototype.put = function(val, callback) {
	this.db.put(this.prefix, val, callback);
};

ValBatch.prototype.get = function(callback) {
	this.db.get(this.prefix, callback);
};

ValBatch.prototype.del = function(callback) {
	this.db.del(this.prefix, callback);
};


function DocsBatch(db, prefix, options) {
	BaseBatch.call(this, db, prefix);
	options = options || {};
	this.projections = [['id']].concat(options.projections || []);
}

inherits(DocsBatch, BaseBatch);

DocsBatch.prototype.put = function(doc, callback) {
	var self = this;
	self.get({id: doc.id}, function(err, oldDoc) {
		// TODO: check exactly for NotFound error
		var operations = [];
		self.projections.forEach(function(projection) {
			var projKey = self._getProjKey(doc, projection);
			if (oldDoc) {
				var oldProjKey = self._getProjKey(oldDoc, projection);
				if (projKey != oldProjKey) operations.push({
					type: 'del',
					key: oldProjKey
				});
			}
			operations.push({type: 'put', key: projKey, value: doc});
		});
		self.db.batch(operations, callback);
	});
};

DocsBatch.prototype._getProjKey = function(doc, projection) {
	var projKey = [this.prefix];
	projection.forEach(function(key) {
		projKey.push(key + ': ' + doc[key]);
	});
	return projKey.join(this.separator);
}

DocsBatch.prototype.find = function(params, callback) {
	// clone params to prevent side effects
	params = extend({}, params);
	callback = callback || noop;
	var self = this;
	params.start = self._getStrKey(params.start);
	params.end = params.end ? self._getStrKey(params.end) : params.start;
	// add end character
	params.end += self.end;
	params.keys = 'keys' in params ? params.keys : true;
	params.values = 'values' in params ? params.values : true;

	var addData = null;
	if (params.keys && params.values) {
		addData = function(data) {result.push(data.value);}
	} else {
		addData = function(data) {result.push(data);}
	}

	var result = [];
	self.db.createReadStream(params)
		.on('data', addData)
		.on('end', function() {
			callback(null, result);
		}).on('error', callback);
};

DocsBatch.prototype._getStrKey = function(objKey) {
	var strKey = [this.prefix];
	for (var key in objKey) {
		strKey.push(key + ': ' + objKey[key]);
	}
	return strKey.join(this.separator);
}

DocsBatch.prototype.get = function(key, callback) {
	this.db.get(this._getStrKey(key), callback);
};


function noop() {};

function extend(dst, src) {
	for (var key in src) {dst[key] = src[key];}
	return dst;
};

exports.ValBatch = ValBatch;
exports.DocsBatch = DocsBatch;
