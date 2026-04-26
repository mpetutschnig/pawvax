import { ChevronRight, Radio, CheckCircle2, PawPrint, Cat } from 'lucide-react';
import { Link } from 'react-router-dom';

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
}

export function PetCard({ id, name, species, breed, age, vaccinationStatus, hasNfcTag, isVetVerified, avatarPath }: PetCardProps) {
  const statusBadge = {
    current:   { className: 'badge badge-success', label: 'Up to Date' },
    due_soon:  { className: 'badge badge-warning', label: 'Due Soon' },
    overdue:   { className: 'badge badge-danger',  label: 'Overdue' },
  }[vaccinationStatus] || { className: 'badge badge-info', label: 'Unknown' };

  return (
    <Link to={`/animals/${id}`} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', textDecoration: 'none', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
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
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}>{name}</div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)' }}>{breed}{age ? ` · ${age}` : ''}</div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className={statusBadge.className}>
            <span className="badge-dot"></span>
            {statusBadge.label}
          </span>
          {hasNfcTag && (
            <span className="badge badge-primary">
              <Radio size={10} strokeWidth={2.5} />
              NFC
            </span>
          )}
          {isVetVerified && (
            <span className="badge badge-info">
              <CheckCircle2 size={10} strokeWidth={2.5} />
              Verified
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={18} color="var(--text-tertiary)" />
    </Link>
  );
}
