var assert = require('assert'),
    util = require('../lib/util.js');


describe('Util', function() {
    describe('hasStringValues', function() {
        it('should succeed on all present values', function() {
            var r = util.hasStringValues({
                'foo': 'a',
                'bar': 'bb',
                'baz': 'ccc'
            }, ['foo', 'bar', 'baz']);
            assert(r);

            var r = util.hasStringValues({
                'foo': 'a',
            }, ['foo']);
            assert(r);

            var r = util.hasStringValues({}, []);
            assert(r);
        });

        it('should fail on missing value', function() {
            var r = util.hasStringValues({
                'foo': 'a',
                'bar': 'bb',
            }, ['foo', 'bar', 'baz']);
            assert.equal(r, false);
        });

        it('should fail on falsey values', function() {
            var r = util.hasStringValues({
                'foo': '',
            }, ['foo']);
            assert.equal(r, false);

            var r = util.hasStringValues({
                'foo': false,
            }, ['foo']);
            assert.equal(r, false);

            var r = util.hasStringValues({
                'foo': 0,
            }, ['foo']);
            assert.equal(r, false);
        });
    });
});
