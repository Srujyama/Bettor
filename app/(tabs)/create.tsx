/**
 * CREATE tab fallback. The center FAB in the tab bar normally opens the
 * create-bet modal directly, so this screen is only reached if something
 * focuses the tab programmatically. It immediately redirects to the modal.
 */
import { Redirect } from 'expo-router';

export default function CreateTabFallback() {
  return <Redirect href="/(modals)/create-bet" />;
}
