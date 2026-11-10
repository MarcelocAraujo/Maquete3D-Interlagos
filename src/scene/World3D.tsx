import { Buildings } from './buildings/Buildings';
import { PitComplex } from './structures/PitComplex';
import { Grandstands } from './structures/Grandstands';
import { Trees } from './vegetation/Trees';
import { Barriers } from './structures/Barriers';
import { Props } from './structures/Props';
import { Paddock } from './structures/Paddock';
import { Signage } from './structures/Signage';
import { registerFacilityBounds } from './labels/Labels';

/** Agrupa as estruturas do autódromo e do entorno. */
export function World3D() {
  registerFacilityBounds();
  return (
    <group>
      <Buildings />
      <PitComplex />
      <Paddock />
      <Signage />
      <Grandstands />
      <Barriers />
      <Trees />
      <Props />
    </group>
  );
}
