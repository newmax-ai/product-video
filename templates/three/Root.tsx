import {Composition} from 'remotion';
import {SpatialDemo} from './SpatialDemo';

export function RemotionRoot() {
  return <>
    <Composition id="SpatialDemo" component={SpatialDemo} width={1280} height={720} fps={30} durationInFrames={360} defaultProps={{theme: 'warm-studio' as const}} />
    <Composition id="SpatialPortrait" component={SpatialDemo} width={720} height={1280} fps={30} durationInFrames={360} defaultProps={{theme: 'warm-studio' as const}} />
  </>;
}
