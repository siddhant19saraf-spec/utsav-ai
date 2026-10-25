import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';

export function NotFoundPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Page not found"
        title="That page slipped off the guest list"
        description="The page you requested does not exist in this preview. Use the navigation to return to a working area."
      />
      <EmptyState
        icon={Compass}
        title="Nothing is planned at this address"
        description="No event, module, or setting lives at this URL. Your workspace data has not been changed."
        action={
          <Link to="/" className="btn-primary">
            Back to overview
          </Link>
        }
      />
    </div>
  );
}
