/**
 * IdentityCard — the two levels, named, never merged.
 *
 * 🚨 `1HHO` IS NOT "HAEMOGLOBIN". It is one experiment: a crystal grown by one
 * team, measured to 2.1 Å, released in 1983. `P69905` is the protein. A card
 * that writes the protein's name over the experiment's id, with nothing saying
 * it is ONE structure OF that protein, states something false about the world —
 * the same way an anatomy atlas would by showing the liver under the heart's
 * title. So both levels get their own heading, and the sentence between them
 * says which is which.
 *
 * The rest of the card is the honesty scale:
 *
 * 🎭 A resolution nobody reported renders `—`, never `0.00 Å`. Four of the 105
 *    PDB entries are solution NMR and have none at all.
 * 🚨 A resolution that IS reported and is coarse gets a sentence, because a
 *    3.5 Å structure and a 1.0 Å structure produce the same picture on screen
 *    and the picture is otherwise the only evidence the reader has.
 * ✂️ A structure with no UniProt accession says so in words. Six entries in
 *    the corpus are DNA, RNA or peptide only, and an empty heading reads as a
 *    lookup that failed.
 */
import { massText, resolutionText, sizeText, type Entry } from './corpus';
import { showsSideChains } from './library';
import { useI18n } from '../i18n/useI18n';
import type { Key } from '../i18n/strings';

/** One label/value line. A value that is not known is a dash, never nothing. */
function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{value === null || value === '' ? '—' : value}</span>
    </div>
  );
}

export function IdentityCard({ entry }: { entry: Entry }) {
  const { t } = useI18n();
  const fam = t(`family.${entry.family}` as Key);

  if (entry.kind === 'pdb') {
    const fine = showsSideChains(entry.resolution);
    return (
      <div className="identity">
        <section className="level">
          <h3>{t('card.experiment')}</h3>
          <p className="ident-id">{entry.id}</p>
          {/* Our label, then their title. Both, in that order: the label is
              what the list and the quiz call it, and the title is what the
              people who did the experiment called it. */}
          <p className="ident-name strong">{entry.label}</p>
          <p className="ident-name">{entry.name}</p>
          <Row label={t('card.method')} value={entry.method} />
          <Row label={t('card.resolution')} value={resolutionText(entry.resolution)} />
          <Row label={t('card.released')} value={entry.released} />
          <Row label={t('card.chains')} value={entry.chains === null ? null : String(entry.chains)} />
          <Row label={t('card.atoms')} value={entry.atoms.toLocaleString()} />
          {/* What this one costs you to carry. The whole point of the cartridge
              is that it works with the cable out, so the price is a fact worth
              printing rather than hiding. */}
          <Row label={t('card.size')} value={sizeText(entry.bytes)} />
          {/* Only when a resolution EXISTS and is coarse. An unknown is not a warning. */}
          {fine === false && (
            <p className="caution">{t('card.lowRes', { r: entry.resolution as number })}</p>
          )}
        </section>

        <section className="level">
          <h3>{t('card.protein')}</h3>
          {entry.uniprot.length ? (
            <>
              <p className="ident-id">{entry.uniprot.join(' · ')}</p>
              {entry.entities.map((e) => <p className="ident-name" key={e}>{e}</p>)}
              <Row label={t('card.organism')} value={entry.organisms.join(', ') || null} />
              <p className="note">{t('card.oneOf')}</p>
            </>
          ) : (
            <p className="note">{t('card.noProtein')}</p>
          )}
        </section>

        <section className="level why">
          <h3>{t('card.why')}</h3>
          <p>{entry.why}</p>
          <p className="note">{fam}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="identity">
      <section className="level">
        <h3>{t('card.compound')}</h3>
        <p className="ident-id">{entry.id}</p>
        {/* ChEBI's own name always shows. Our alias sits above it as the
            label a student reads, never in place of it. */}
        {entry.alias && <p className="ident-name strong">{entry.alias}</p>}
        <p className="ident-name">{entry.name}</p>
        <Row label={t('card.formula')} value={entry.formula} />
        <Row label={t('card.mass')} value={massText(entry.mass)} />
        <Row label={t('card.charge')} value={entry.charge === null ? null : String(entry.charge)} />
        <Row label={t('card.atoms')} value={entry.atoms === null ? null : String(entry.atoms)} />
        <Row label={t('card.size')} value={sizeText(entry.bytes)} />
      </section>

      <section className="level">
        <h3>{t('card.inchikey')}</h3>
        {/* The key is worth its own block: it is computed from the structure
            rather than assigned by anyone, so it is the same 27 characters in
            every database and every language. */}
        <p className="ident-key">{entry.inchikey ?? '—'}</p>
        {entry.definition && <p className="note">{entry.definition}</p>}
      </section>

      <section className="level why">
        <h3>{t('card.why')}</h3>
        <p>{entry.why}</p>
        <p className="note">{fam}</p>
      </section>
    </div>
  );
}
