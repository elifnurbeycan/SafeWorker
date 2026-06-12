const Alarm = require('../models/Alarm');
const { emitEvent } = require('./socket.service');

const populateAlarm = (query) => {
  return query
    .populate('workerId', 'name email role')
    .populate('deviceId', 'deviceCode deviceName networkStatus batteryLevel')
    .populate('shiftId', 'startTime endTime status');
};

const createAlarm = async (alarmPayload, options = {}) => {
  const shouldEmit = options.emit !== false;

  const duplicateCheckedTypes = [
    'INACTIVITY',
    'POST_FALL_INACTIVITY',
    'LOW_BATTERY',
    'CONNECTION_LOST'
  ];

  if (duplicateCheckedTypes.includes(alarmPayload.type)) {
    const existingActiveAlarm = await Alarm.findOne({
      workerId: alarmPayload.workerId,
      type: alarmPayload.type,
      status: 'active'
    });

    if (existingActiveAlarm) {
      await Alarm.findByIdAndDelete(existingActiveAlarm._id);
    }
  }

  const alarm = await Alarm.create({
    workerId: alarmPayload.workerId,
    deviceId: alarmPayload.deviceId,
    shiftId: alarmPayload.shiftId,
    type: alarmPayload.type,
    message: alarmPayload.message,
    riskScore: alarmPayload.riskScore,
    status: alarmPayload.status || 'active'
  });

  const populatedAlarm = await populateAlarm(Alarm.findById(alarm._id));

  if (shouldEmit) {
    emitEvent(options.eventName || 'alarm:new', populatedAlarm);
  }

  return populatedAlarm;
};

module.exports = {
  createAlarm,
  populateAlarm
};
