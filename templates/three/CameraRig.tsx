import {useLayoutEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {PerspectiveCamera} from 'three';
import {sampleCamera, type CameraKey} from './timeline';

export function CameraRig({time, keys, portrait = false}: {
  time: number;
  keys: readonly CameraKey[];
  portrait?: boolean;
}) {
  const camera = useThree(state => state.camera);
  const pose = sampleCamera(keys, time);
  useLayoutEffect(() => {
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    if (camera instanceof PerspectiveCamera) {
      camera.fov = portrait ? pose.fov + 13 : pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
  }, [camera, pose.position[0], pose.position[1], pose.position[2], pose.target[0], pose.target[1], pose.target[2], pose.fov, portrait]);
  return null;
}
