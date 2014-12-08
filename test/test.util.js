var assert = require('assert'),
    util = require('../lib/util.js');


describe('Util', function() {
    describe('missingStringValues', function() {
        it('should succeed on all present values', function() {
            var r = util.missingStringValues({
                'foo': 'a',
                'bar': 'bb',
                'baz': 'ccc'
            }, ['foo', 'bar', 'baz']);
            assert.equal(r.length, 0);

            var r = util.missingStringValues({
                'foo': 'a',
            }, ['foo']);
            assert.equal(r.length, 0);

            var r = util.missingStringValues({}, []);
            assert.equal(r.length, 0);
        });

        it('should fail on missing value', function() {
            var r = util.missingStringValues({
                'foo': 'a',
                'bar': 'bb',
            }, ['foo', 'bar', 'baz']);
            assert.deepEqual(r, ['baz']);
        });

        it('should fail on falsey values', function() {
            var r = util.missingStringValues({
                'foo': '',
            }, ['foo']);
            assert.deepEqual(r, ['foo']);

            var r = util.missingStringValues({
                'foo': false,
            }, ['foo']);
            assert.deepEqual(r, ['foo']);

            var r = util.missingStringValues({
                'foo': 0,
            }, ['foo']);
            assert.deepEqual(r, ['foo']);
        });
    });

    describe('mergeArrays', function() {
        it('should merge arrays', function() {
            var r = util.mergeArrays([], [1,2,3], [], [3,4,5,6], []);
            assert.deepEqual(r, [1,2,3,3,4,5,6]);
        });
    });

    describe('mergeObjects', function() {
        it('should merge objects', function() {
            var r = util.mergeObjects({}, {'foo': 123, 'bar': 234}, {}, {'bar': 345, 'baz': 456}, {});
            assert.deepEqual(r, {'foo': 123, 'bar': 345, 'baz': 456});
        });
    });

    describe('pager', function() {
        it('should page in chunks', function() {
            var p = util.pager([1,2,3,4,5,6,7,8,9,10], 3);
            assert.deepEqual(p, [[1,2,3], [4,5,6], [7,8,9], [10]]);
        });

        it('should handle empty arrays', function() {
            var p = util.pager([], 3);
            assert.deepEqual(p, []);
        });
    });
});
