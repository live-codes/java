// The full corpus: the original core set plus the wider coverage set.
import { PROGRAMS as CORE, STDIN } from './programs.mjs';
import { PROGRAMS_EXTRA } from './programs-extra.mjs';

export { STDIN };

const ALL = [...CORE, ...PROGRAMS_EXTRA];

// `?only=id1,id2` restricts a run to those programs — used to re-check specific failures on the
// slow Doppio baseline without paying for the whole set.
const only =
  typeof location !== 'undefined' ? new URLSearchParams(location.search).get('only') : null;

export const PROGRAMS = only
  ? ALL.filter((program) => only.split(',').includes(program.id))
  : ALL;
