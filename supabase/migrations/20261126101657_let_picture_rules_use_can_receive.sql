-- The rule that lets store people add receipt photos asks private.can_receive,
-- and every picture upload checks every upload rule. Signed-in people were not
-- allowed to run that function, so every upload failed with
-- "permission denied for function can_receive" (for example the concept image
-- of a new sample). Signed-in people may run it, like the other functions the
-- rules use.
grant execute on function private.can_receive(text) to authenticated;
