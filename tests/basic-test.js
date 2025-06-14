const { expect } = require('chai');

describe('Basic Test', function() {
    it('should pass a simple test', function() {
        expect(1 + 1).to.equal(2);
        console.log('✅ Basic test passed');
    });

    it('should have environment variables loaded', function() {
        require('dotenv').config();
        expect(process.env.OPENAI_API_KEY).to.exist;
        expect(process.env.OPENAI_API_KEY.length).to.be.above(0);
        console.log('✅ Environment variables loaded');
    });
});
