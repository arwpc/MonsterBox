import numpy as np
import cv2
import busio
import board
from adafruit_servokit import ServoKit
import sys
import datetime

# Map one range to another
def remap(x, in_min, in_max, out_min, out_max):
    x_diff = x - in_min
    out_range = out_max - out_min
    in_range = in_max - in_min
    temp_out = x_diff * out_range / in_range + out_min

    if out_max < out_min:
        out_max, out_min = out_min, out_max

    if temp_out > out_max:
        return out_max
    elif temp_out < out_min:
        return out_min
    else:
        return temp_out


class HeadTracker:
    def __init__(self, pca_channel=0):
        self.IN_MIN = 30.0
        self.IN_MAX = 160.0
        self.OUT_MIN = 160.0
        self.OUT_MAX = 30.0
        self.head_angle = 90.0
        self.head_angle_ave = 90.0
        self.head_angle_alpha = 0.25
        self.kit = ServoKit(channels=16, i2c=(busio.I2C(board.SCL, board.SDA)))
        self.pca_channel = pca_channel
        self.cap = None

    def setup_camera(self):
        self.cap = cv2.VideoCapture(0)
        self.cap.set(3, 160)  # horizontal resolution
        self.cap.set(4, 120)  # vertical resolution

    def track(self):
        object_detector = cv2.createBackgroundSubtractorMOG2(history=10, varThreshold=5)

        while True:
            ret, frame = self.cap.read()
            roi = frame[0:240, 0:320]  # Region of Interest
            mask = object_detector.apply(roi)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            detections = []
            biggest_index = 0
            biggest_area = 0
            ind = 0

            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > 150:
                    x, y, w, h = cv2.boundingRect(cnt)
                    detections.append([x, y, w, h])
                    area = w * h
                    if area > biggest_area:
                        biggest_area = area
                        biggest_index = ind
                    ind += 1

            if detections:
                x, y, w, h = detections[biggest_index]
                self.head_angle = remap(float(x + (w / 2.0)), self.IN_MIN, self.IN_MAX, self.OUT_MIN, self.OUT_MAX)
                self.head_angle_ave = self.head_angle * self.head_angle_alpha + self.head_angle_ave * (1.0 - self.head_angle_alpha)
                self.kit.servo[self.pca_channel].angle = int(self.head_angle_ave)
                print(f'x: {x}, head_angle: {self.head_angle}, average: {self.head_angle_ave}')

    def stop_tracking(self):
        if self.cap:
            self.cap.release()
        cv2.destroyAllWindows()
        print("Tracking stopped.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python head_track.py <command> [pca_channel]")
        sys.exit(1)

    command = sys.argv[1]
    pca_channel = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    tracker = HeadTracker(pca_channel)

    try:
        if command == "start":
            tracker.setup_camera()
            tracker.track()
        elif command == "stop":
            tracker.stop_tracking()
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        sys.exit(1)
    finally:
        tracker.stop_tracking()