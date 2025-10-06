# after you confirm DC works, switch back to PWM at 20 kHz
pi.set_PWM_frequency(RPWM, 20000)
pi.set_PWM_frequency(LPWM, 20000)

def forward_ramp():
    pi.write(LPWM,0)
    # kick
    pi.set_PWM_dutycycle(RPWM,255); time.sleep(0.25)
    # run
    pi.set_PWM_dutycycle(RPWM,200)

def reverse_ramp():
    pi.write(RPWM,0)
    pi.set_PWM_dutycycle(LPWM,255); time.sleep(0.25)
    pi.set_PWM_dutycycle(LPWM,200)
