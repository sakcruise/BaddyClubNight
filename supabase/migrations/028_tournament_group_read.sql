-- Members of a friends group can read that group's tournaments (groups, scores and
-- fixtures). Read-only; the owner's existing manage policies are unchanged.
DROP POLICY IF EXISTS "Group members read tournaments" ON tournaments;
CREATE POLICY "Group members read tournaments" ON tournaments FOR SELECT
  USING (EXISTS (SELECT 1 FROM sessions s WHERE s.id = tournaments.session_id AND s.group_id IS NOT NULL AND is_group_member(s.group_id)));

DROP POLICY IF EXISTS "Group members read tournament players" ON tournament_players;
CREATE POLICY "Group members read tournament players" ON tournament_players FOR SELECT
  USING (EXISTS (SELECT 1 FROM tournaments t JOIN sessions s ON s.id = t.session_id
                 WHERE t.id = tournament_players.tournament_id AND s.group_id IS NOT NULL AND is_group_member(s.group_id)));

DROP POLICY IF EXISTS "Group members read tournament fixtures" ON tournament_fixtures;
CREATE POLICY "Group members read tournament fixtures" ON tournament_fixtures FOR SELECT
  USING (EXISTS (SELECT 1 FROM tournaments t JOIN sessions s ON s.id = t.session_id
                 WHERE t.id = tournament_fixtures.tournament_id AND s.group_id IS NOT NULL AND is_group_member(s.group_id)));
