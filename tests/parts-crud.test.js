const { describe } = require('mocha');

describe('Parts CRUD Operations', function() {
  require('./parts/motor.test');
  require('./parts/linear-actuator.test');
  require('./parts/sensor.test');
  require('./parts/servo.test');
  require('./parts/light.test');
  require('./parts/led.test');
});
