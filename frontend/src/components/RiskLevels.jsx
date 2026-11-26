import { useId } from 'react';
import { Lock, Waves } from 'lucide-react';
import { usePrivacyNotice } from '../privacy/PrivacyContext.jsx';
import './PrivacyCard.css';
import './RiskLevels.css';

const LEVELS = [
  { key: 'low', animation: 'calm' },
  { key: 'medium', animation: 'caution' },
  { key: 'high', animation: 'alert' },
  { key: 'unknown', animation: 'curious' },
];

export default function RiskLevels({ t }) {
  const { reviewNotice } = usePrivacyNotice();
  const privacyPanelId = useId();

  return (
    <section className="risks-section risks-section--premium" id="risk-levels" aria-labelledby="risk-title">
      <div className="page-container">
        <div className="risk-section-heading">
          <div>
            <p className="section-eyebrow"><Waves size={19} aria-hidden="true" />{t('risk.eyebrow')}</p>
            <h2 id="risk-title">{t('risk.title')}</h2>
          </div>
          <p className="risk-section-intro">{t('risk.intro')}</p>
        </div>

        <div className="risk-grid">
          {LEVELS.map((level) => (
            <article className={`risk-card risk-${level.key}`} key={level.key}>
              <div className="risk-art">
                <div className="risk-card-color" aria-hidden="true" />
                <picture>
                  <source media="(prefers-reduced-motion: reduce)" srcSet={`/assets/risk/surfy-${level.animation}-still.png`} />
                  <img
                    src={`/assets/risk/surfy-${level.animation}.gif`}
                    alt={t(`risk.alt.${level.key}`)}
                    width="256"
                    height="256"
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
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
          </button>
        </article>
      </div>
    </section>
  );
}
