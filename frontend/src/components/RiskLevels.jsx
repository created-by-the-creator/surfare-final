import { useId } from 'react';
import { ArrowUpRight, Lock } from 'lucide-react';
import { ASSETS } from '../assets.js';
import { usePrivacyNotice } from '../privacy/PrivacyContext.jsx';
import './PrivacyCard.css';

const LEVELS = [
  { key: 'low', mascot: ASSETS.surfyWink },
  { key: 'medium', mascot: ASSETS.surfyPoint },
  { key: 'high', mascot: ASSETS.surfyAlarm },
  { key: 'unknown', mascot: ASSETS.surfyMagnify },
];

export default function RiskLevels({ t }) {
  const { reviewNotice } = usePrivacyNotice();
  const privacyPanelId = useId();

  return (
    <section className="risks-section" id="risk-levels" aria-labelledby="risk-title">
      <div className="page-container">
        <p className="section-eyebrow">{t('risk.eyebrow')}</p>
        <h2 id="risk-title">{t('risk.title')}</h2>

        <div className="risk-grid">
          {LEVELS.map((level) => (
            <article className={`risk-card risk-${level.key}`} key={level.key}>
              <div className="risk-art">
                <div className="risk-card-color" aria-hidden="true" />
                <img
                  src={level.mascot}
                  alt={t(`risk.alt.${level.key}`)}
                  width="1000"
                  height="1000"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="risk-card-copy">
                <span className="risk-pill">{t(`risk.${level.key}.badge`)}</span>
                <h3>{t(`risk.${level.key}.name`)}</h3>
                <p>{t(`risk.${level.key}.description`)}</p>
              </div>
            </article>
          ))}
        </div>

        <article className="privacy-card" id="privacy" aria-labelledby={`${privacyPanelId}-title`}>
          <div className="privacy-heading">
            <span className="privacy-icon">
              <Lock aria-hidden="true" size={28} strokeWidth={2} />
            </span>
            <div>
              <h3 id={`${privacyPanelId}-title`}>{t('privacy.title')}</h3>
              <p>{t('privacy.body')}</p>
            </div>
          </div>
          <button
            className="privacy-toggle"
            type="button"
            aria-haspopup="dialog"
            onClick={reviewNotice}
          >
            <span>{t('notice.readPolicy')}</span>
            <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        </article>
      </div>
    </section>
  );
}
