import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function () {
    // নোটিফিকেশন বার থেকে Play বাটন চাপলে
    TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    // নোটিফিকেশন বার থেকে Pause বাটন চাপলে
    TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    // নোটিফিকেশন বার থেকে Stop বাটন চাপলে
    TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.destroy());
};