import { Link, useParams } from 'react-router-dom';
import { getHelper } from '@/helpers/registry';
import { completeOnboarding, useHelperInstances } from '@/helpers/state';

/** A Helper's own screen: first its onboarding, then its dashboard. Hidden while the Helper is off. */
export function HelperRoute() {
  const { id = '' } = useParams();
  const instances = useHelperInstances();
  const helper = getHelper(id);
  const inst = instances.find((i) => i.id === id);
  if (!helper) {
    return (
      <p className="empty">
        There is no such Helper. <Link to="/helpers">Back to Helpers</Link>
      </p>
    );
  }
  if (!inst?.enabled) {
    return (
      <p className="empty">
        {helper.name} is turned off. Turn it on from <Link to="/helpers">Helpers</Link> to use it.
        Its data is kept either way.
      </p>
    );
  }
  return inst.onboarded ? (
    <helper.Dashboard />
  ) : (
    <helper.Onboarding onDone={() => void completeOnboarding(helper)} />
  );
}
