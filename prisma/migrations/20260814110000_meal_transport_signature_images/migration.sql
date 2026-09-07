-- Real hand-drawn digital signatures (canvas signature pad PNGs) rather
-- than just a typed name rendered in a script font.
ALTER TABLE `MealTransportReport`
  ADD COLUMN `preparerSignatureImage` LONGTEXT NULL,
  ADD COLUMN `approverSignatureImage` LONGTEXT NULL;
