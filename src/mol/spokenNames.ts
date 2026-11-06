/**
 * spokenNames — the everyday French and Spanish names of structures whose English name no
 * stem reaches (doc 149). « eau » is not a spelling of « water », and « saccharose » is not
 * one of « sucrose », so `agentFind`'s stem cannot join them: they are listed here, by id.
 *
 * Only names a person actually says. A name whose stem already meets the English one
 * (« insuline », « caféine », « dopamine », « cholestérol ») is NOT repeated here.
 * These are matching aids for the agent door only: the screen keeps the corpus's own words.
 *
 * @module mol/spokenNames
 */
export const SPOKEN_NAMES: Readonly<Record<string, readonly string[]>> = {
  // small molecules
  'CHEBI:15377': ['eau', 'agua', 'H2O'],
  'CHEBI:16199': ['urée'],
  'CHEBI:16236': ['alcool', 'alcohol', 'éthanol', 'etanol'],
  'CHEBI:29073': ['vitamine C', 'vitamina C', 'acide ascorbique', 'ácido ascórbico'],
  'CHEBI:15379': ['oxygène', 'oxígeno', 'oxygen'],
  'CHEBI:16526': ['dioxyde de carbone', 'gaz carbonique', 'dióxido de carbono', 'CO2'],
  'CHEBI:17544': ['bicarbonate', 'bicarbonato'],
  'CHEBI:422': ['acide lactique', 'ácido láctico', 'lactic acid'],
  'CHEBI:30769': ['acide citrique', 'ácido cítrico'],
  'CHEBI:17775': ['acide urique', 'ácido úrico'],
  'CHEBI:4167': ['glucose', 'glucosa'],
  'CHEBI:17992': ['saccharose', 'sucre de table', 'sacarosa', 'azúcar de mesa'],
  'CHEBI:15756': ['acide palmitique', 'ácido palmítico'],
  'CHEBI:16196': ['acide oléique', 'ácido oleico'],
  'CHEBI:17351': ['acide linoléique', 'ácido linoleico'],
  'CHEBI:15843': ['acide arachidonique', 'ácido araquidónico'],
  'CHEBI:17053': ['acide aspartique', 'aspartate', 'ácido aspártico'],
  'CHEBI:16015': ['acide glutamique', 'glutamate', 'ácido glutámico'],
  'CHEBI:16865': ['GABA'],
  'CHEBI:16480': ['monoxyde d’azote', 'oxyde nitrique', 'óxido nítrico'],
  'CHEBI:23965': ['œstradiol', 'estradiol'],
  'CHEBI:15365': ['acide acétylsalicylique', 'ácido acetilsalicílico'],
  'CHEBI:46195': ['acétaminophène', 'acetaminophen', 'Doliprane'],
  'CHEBI:18208': ['pénicilline', 'penicilina', 'penicillin'],
  'CHEBI:15422': ['adénosine triphosphate', 'adenosine triphosphate'],
  'CHEBI:18230': ['chlorophylle', 'clorofila', 'chlorophyll'],
  'CHEBI:26355': ['hème', 'heme'],
  // macromolecules
  '1BNA': ['double hélice', 'doble hélice', 'ADN B'],
  '1GFL': ['GFP', 'protéine fluorescente verte', 'proteína verde fluorescente'],
  '1IGT': ['anticorps', 'anticuerpo', 'antibody', 'immunoglobuline'],
  '6VXX': ['spike', 'protéine spike', 'proteína spike'],
  '1EHZ': ['ARN de transfert', 'ARNt', 'ARN de transferencia', 'tRNA'],
  '4V6X': ['ribosome humain', 'ribosoma humano'],
};

/** The spoken names of one structure, none when it has none. */
export const spokenNamesOf = (id: string): readonly string[] => SPOKEN_NAMES[id] ?? [];
