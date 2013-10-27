'use strict';

var inherits = require('util').inherits;


function BaseSection(db, name) {
	this.db = db;
	if (!db) throw new Error('`db` for batch is not set');
	if (!name) throw new Error('`name` for batch is not set');
	this.name = name;
}

BaseSection.prototype.separator = '~';
BaseSection.prototype.end = '\xff';


function ValSection(db, name) {
	BaseSection.call(this, db, name);
}

inherits(ValSection, BaseSection);

ValSection.prototype.put = function(val, callback) {
	this.db.put(this.name, val, callback);
};

ValSection.prototype.get = function(callback) {
	this.db.get(this.name, callback);
};

ValSection.prototype.del = function(callback) {
	this.db.del(this.name, callback);
};


function DocsSection(db, name, options) {
	BaseSection.call(this, db, name);
	options = options || {};
	this.projections = [['id']].concat(options.projections || []);
}

inherits(DocsSection, BaseSection);

DocsSection.prototype.put = function(docs, callback) {
	var self = this;
	if (!Array.isArray(docs)) docs = [docs];

	var err = this._validateDocs(docs);
	if (err) {callback(err); return;}

	var docsReady = 0,
		operations = [];

	docs.forEach(function(doc) {
		self.get({id: doc.id}, function(err, oldDoc) {
			// TODO: check exactly for NotFound error
			self.projections.forEach(function(projection) {
				var projKey = self._getProjKey(doc, projection);
				if (oldDoc) {
					var oldProjKey = self._getProjKey(oldDoc, projection);
					if (projKey !== oldProjKey) operations.push({
						type: 'del',
						key: oldProjKey
					});
				}
				operations.push({type: 'put', key: projKey, value: doc});
			});
			docsReady++;
			// exec batch after all operations was generated
			if (docsReady === docs.length) {
				self.db.batch(operations, callback);
			}
		});
	});
};

DocsSection.prototype._validateDocs = function(docs) {
	if (!Array.isArray(docs)) docs = [docs];
	for (var i = 0; i < docs.length; i++) {
		var doc = docs[i];
		var err = null;
		if (typeof doc !== 'object') {
			err = new Error(
				'Document should be an `object`: ' + JSON.stringify(doc)
			);
		} else if ('id' in doc === false) {
			err = new Error('Document doesn`t have `id`: ' + JSON.stringify(doc));
		}
		if (err) return err;
	}
};

DocsSection.prototype._getProjKey = function(doc, projection) {
	var projKey = [this.name];
	projection.forEach(function(key) {
		projKey.push(key + ': ' + doc[key]);
	});
	return projKey.join(this.separator);
}

DocsSection.prototype.find = function(params, callback) {
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

DocsSection.prototype._getStrKey = function(objKey) {
	var strKey = [this.name];
	for (var key in objKey) {
		strKey.push(key + ': ' + objKey[key]);
	}
	return strKey.join(this.separator);
}

DocsSection.prototype.get = function(key, callback) {
	this.db.get(this._getStrKey(key), callback);
};


function noop() {};

function extend(dst, src) {
	for (var key in src) {dst[key] = src[key];}
	return dst;
};

exports.ValSection = ValSection;
exports.DocsSection = DocsSection;
