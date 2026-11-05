import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth";

/** Links along the top of the home, Community and account pages. */
export function TopNav({ brand = false }: { brand?: boolean }) {
  const { user, isAdmin } = useAuth();
  return (
    <nav className="account-bar" aria-label="Main">
      {brand ? (
        <Link to="/" className="auth-brand nav-brand" aria-label="Pint Route home">
          🍺 <span className="nav-brand-text">Pint Route</span>
        </Link>
      ) : (
        <span className="nav-spacer" />
      )}
      <NavLink to="/community" className="text-btn">
        Community
      </NavLink>
      {user === undefined ? null : user ? (
        <>
          {isAdmin && (
            <NavLink to="/stats" className="text-btn">
              Stats
            </NavLink>
          )}
          <NavLink to="/account" className="btn btn-small btn-ghost">
            My account
          </NavLink>
        </>
      ) : (
        <>
          <Link to="/login" className="text-btn">
            Log in
          </Link>
          <Link to="/register" className="btn btn-small btn-ghost">
            Sign up
          </Link>
        </>
      )}
    </nav>
  );
}
