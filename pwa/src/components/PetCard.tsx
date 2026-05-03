import { ChevronRight, Radio, CheckCircle2, PawPrint, Cat } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface PetCardProps {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other' | string;
  breed?: string;
  age?: string;
  vaccinationStatus: 'current' | 'due_soon' | 'overdue' | string;
  hasNfcTag?: boolean;
  isVetVerified?: boolean;
  avatarPath?: string;
  isArchived?: boolean;
}

export function PetCard({ id, name, species, breed, age, vaccinationStatus, hasNfcTag, isVetVerified, avatarPath, isArchived }: PetCardProps) {
  const { t } = useTranslation();
  const statusBadge = {
    current:   { className: 'badge badge-success', label: t('petCard.upToDate') },
    due_soon:  { className: 'badge badge-warning', label: t('petCard.dueSoon') },
    overdue:   { className: 'badge badge-danger',  label: t('petCard.overdue') },
  }[vaccinationStatus] || { className: 'badge badge-info', label: t('common.loading') };

  return (
    <Link to={`/animals/${id}`} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', textDecoration: 'none', marginBottom: 'var(--space-3)', cursor: 'pointer', opacity: isArchived ? 0.6 : 1, filter: isArchived ? 'grayscale(0.4)' : 'none' }}>
      {/* Avatar */}
      <div style={{
        width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
        background: 'var(--primary-500)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
      }}>
        {avatarPath ? (
          <img src={`/uploads/${avatarPath.split('/').pop()}`} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          species === 'cat' ? <Cat size={22} color="white" strokeWidth={1.8} /> : <PawPrint size={22} color="white" strokeWidth={1.8} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {isArchived && <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>✝</span>}
          {name}
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)' }}>{breed}{age ? ` · ${age}` : ''}</div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className={statusBadge.className}>
            <span className="badge-dot"></span>
            {statusBadge.label}
          </span>
          {hasNfcTag && (
            <span className="badge badge-primary">
              <Radio size={10} strokeWidth={2.5} />
              {t('animal.nfcActive')}
            </span>
          )}
          {isVetVerified && (
            <span className="badge badge-info">
              <CheckCircle2 size={10} strokeWidth={2.5} />
              {t('animal.vetVerified')}
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={18} color="var(--text-tertiary)" />
    </Link>
  );
}
