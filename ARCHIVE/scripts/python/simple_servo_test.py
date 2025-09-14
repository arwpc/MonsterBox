import lgpio
import time
print(" Testing servo on pin 18...\)
h = lgpio.gpiochip_open(0)
lgpio.gpio_claim_output(h, 18)
lgpio.tx_servo(h, 18, 1500, 50, 0, 1)
time.sleep(2)
lgpio.tx_servo(h, 18, 0)
lgpio.gpio_free(h, 18)
lgpio.gpiochip_close(h)
print(\Test complete\)
