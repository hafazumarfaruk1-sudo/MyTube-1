import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function() {
  // নোটিফিকেশন বার থেকে Play বাটন চাপলে যা হবে
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());

  // নোটিফিকেশন বার থেকে Pause বাটন চাপলে যা হবে
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());

  // নোটিফিকেশন বার থেকে Stop/Cross বাটন চাপলে যা হবে
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.destroy());
};