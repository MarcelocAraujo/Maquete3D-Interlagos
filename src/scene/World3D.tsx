import { Buildings } from './buildings/Buildings';
import { PitComplex } from './structures/PitComplex';
import { Grandstands } from './structures/Grandstands';
import { Trees } from './vegetation/Trees';
import { Barriers } from './structures/Barriers';
import { Props } from './structures/Props';
import { registerFacilityBounds } from './labels/Labels';

/** Agrupa as estruturas do autódromo e do entorno. */
export function World3D() {
  registerFacilityBounds();
  return (
    <group>
      <Buildings />
      <PitComplex />
      <Grandstands />
      <Barriers />
      <Trees />
      <Props />
    </group>
  );
}
