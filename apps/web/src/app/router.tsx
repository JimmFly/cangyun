import { Route, Routes } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { NotFoundRoute } from './routes/NotFoundRoute';
import { HomeRoute } from '../features/home/routes/HomeRoute';
import { ChatRoute } from '../features/chat/routes/ChatRoute';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route index element={<HomeRoute />} />
        <Route path="chat" element={<ChatRoute />} />
        <Route path="*" element={<NotFoundRoute />} />
      </Route>
    </Routes>
  );
}
