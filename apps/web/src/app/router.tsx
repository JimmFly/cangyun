import { Route, Routes } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { NotFoundRoute } from './routes/NotFoundRoute';
import { HomeRoute } from '../features/home/routes/HomeRoute';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route index element={<HomeRoute />} />
        <Route path="*" element={<NotFoundRoute />} />
      </Route>
    </Routes>
  );
}
