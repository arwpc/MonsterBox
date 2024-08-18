const Gpio = require('onoff').Gpio; // Import the onoff library

// Set up GPIO 17 as an output
const led = new Gpio(17, 'out');

// Function to turn the LED on
const turnOn = () => {
  led.writeSync(1); // Set GPIO 17 to high (3.3V)
  console.log('LED is ON');
};

// Function to turn the LED off
const turnOff = () => {
  led.writeSync(0); // Set GPIO 17 to low (0V)
  console.log('LED is OFF');
};

// Blink the LED every second
const blinkLED = () => {
  if (led.readSync() === 0) {
    turnOn();
  } else {
    turnOff();
  }
};

// Blink the LED every second
const interval = setInterval(blinkLED, 1000);

// Clean up the GPIO on exit
process.on('SIGINT', () => {
  clearInterval(interval); // Stop the interval
  led.writeSync(0); // Turn the LED off
  led.unexport(); // Unexport the GPIO to free it
  console.log('Exiting and cleaning up...');
  process.exit();
});
